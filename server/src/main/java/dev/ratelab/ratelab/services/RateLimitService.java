package dev.ratelab.ratelab.services;

import dev.ratelab.ratelab.algorithms.RateLimiterAlgorithm;
import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.EvaluateRequest;
import dev.ratelab.ratelab.model.RateLimitDecision;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RateLimitService {
    private final Map<AlgorithmType, RateLimiterAlgorithm> algorithms;

    public RateLimitService(List<RateLimiterAlgorithm> algorithms) {
        this.algorithms = new EnumMap<>(AlgorithmType.class);
        algorithms.forEach(algorithm -> this.algorithms.put(algorithm.type(), algorithm));
    }

    public RateLimitDecision evaluate(EvaluateRequest request) {
        validateConfig(request.algorithm(), request.config());
        RateLimiterAlgorithm algorithm = algorithms.get(request.algorithm());
        if (algorithm == null) {
            throw new IllegalStateException("No implementation registered for " + request.algorithm());
        }
        return algorithm.evaluate(request.clientId(), request.config());
    }

    private void validateConfig(AlgorithmType type, AlgorithmConfig config) {
        switch (type) {
            case TOKEN_BUCKET -> {
                require(config.capacity(), "capacity");
                require(config.refillTokens(), "refillTokens");
                require(config.refillPeriodSeconds(), "refillPeriodSeconds");
            }
            case LEAKY_BUCKET -> {
                require(config.capacity(), "capacity");
                if (config.leakRatePerSecond() == null
                    || !Double.isFinite(config.leakRatePerSecond())
                    || config.leakRatePerSecond() <= 0) {
                    throw new IllegalArgumentException("leakRatePerSecond must be a positive finite number");
                }
            }
            case FIXED_WINDOW_COUNTER, SLIDING_WINDOW_LOG, SLIDING_WINDOW_COUNTER -> {
                require(config.maximumRequests(), "maximumRequests");
                require(config.windowSeconds(), "windowSeconds");
            }
        }
    }

    private void require(Number value, String field) {
        if (value == null || value.longValue() <= 0) {
            throw new IllegalArgumentException(field + " must be greater than zero");
        }
    }
}
