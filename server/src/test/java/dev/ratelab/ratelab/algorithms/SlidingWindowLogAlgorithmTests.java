package dev.ratelab.ratelab.algorithms;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import org.junit.jupiter.api.Test;

class SlidingWindowLogAlgorithmTests {
    private final MutableClock clock = new MutableClock(0);
    private final SlidingWindowLogAlgorithm algorithm = new SlidingWindowLogAlgorithm(clock);
    private final AlgorithmConfig config = new AlgorithmConfig(2, 10L, null, null, null, null);

    @Test
    void rejectsWhenMaximumRequestsAreStillInsideWindow() {
        assertTrue(algorithm.evaluate("client", config).allowed());
        clock.advanceMillis(1_000);
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertFalse(algorithm.evaluate("client", config).allowed());
    }

    @Test
    void expiresOldRequestsAtWindowBoundary() {
        algorithm.evaluate("client", config);
        algorithm.evaluate("client", config);
        clock.advanceMillis(10_000);

        assertTrue(algorithm.evaluate("client", config).allowed());
    }
}
