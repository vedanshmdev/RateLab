package dev.ratelab.ratelab.algorithms;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import org.junit.jupiter.api.Test;

class TokenBucketAlgorithmTests {
    private final MutableClock clock = new MutableClock(0);
    private final TokenBucketAlgorithm algorithm = new TokenBucketAlgorithm(clock);
    private final AlgorithmConfig config = new AlgorithmConfig(null, null, 2, 1, 1L, null);

    @Test
    void allowsRequestsUpToCapacityThenRejects() {
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertFalse(algorithm.evaluate("client", config).allowed());
    }

    @Test
    void refillsTokensAsTimePasses() {
        algorithm.evaluate("client", config);
        algorithm.evaluate("client", config);
        clock.advanceMillis(1_000);

        assertTrue(algorithm.evaluate("client", config).allowed());
    }
}
