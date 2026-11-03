package dev.ratelab.ratelab.algorithms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import org.junit.jupiter.api.Test;

class LeakyBucketAlgorithmTests {
    private final MutableClock clock = new MutableClock(0);
    private final LeakyBucketAlgorithm algorithm = new LeakyBucketAlgorithm(clock);
    private final AlgorithmConfig config = new AlgorithmConfig(null, null, 1, null, null, 1.0);

    @Test
    void rejectsOverflowRatherThanQueueing() {
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertFalse(algorithm.evaluate("client", config).allowed());
    }

    @Test
    void reportsRetryDelayInMilliseconds() {
        algorithm.evaluate("client", config);

        var decision = algorithm.evaluate("client", config);

        assertEquals(1_000, decision.retryAfterMillis());
    }

    @Test
    void freesCapacityAsWaterLeaksOut() {
        algorithm.evaluate("client", config);
        clock.advanceMillis(1_000);

        assertTrue(algorithm.evaluate("client", config).allowed());
    }
}
