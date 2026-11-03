package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.time.Clock;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class SlidingWindowLogAlgorithm implements RateLimiterAlgorithm {
    private final Clock clock;
    private final Map<String, ArrayDeque<Long>> requestsByClient = new HashMap<>();

    public SlidingWindowLogAlgorithm(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AlgorithmType type() {
        return AlgorithmType.SLIDING_WINDOW_LOG;
    }

    @Override
    public synchronized RateLimitDecision evaluate(String clientId, AlgorithmConfig config) {
        long now = clock.millis();
        long windowMillis = config.windowSeconds() * 1_000;
        ArrayDeque<Long> requests = requestsByClient.computeIfAbsent(clientId, ignored -> new ArrayDeque<>());
        long cutoff = now - windowMillis;
        while (!requests.isEmpty() && requests.peekFirst() <= cutoff) {
            requests.removeFirst();
        }

        boolean allowed = requests.size() < config.maximumRequests();
        if (allowed) {
            requests.addLast(now);
        }
        long retryAfter = allowed ? 0 : Math.max(0, requests.peekFirst() + windowMillis - now);
        return new RateLimitDecision(
            type(),
            allowed,
            config.maximumRequests() - requests.size(),
            retryAfter
        );
    }
}