package dev.ratelab.ratelab.algorithms;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import org.junit.jupiter.api.Test;

class FixedWindowCounterAlgorithmTests {
    private final MutableClock clock = new MutableClock(0);
    private final FixedWindowCounterAlgorithm algorithm = new FixedWindowCounterAlgorithm(clock);
    private final AlgorithmConfig config = new AlgorithmConfig(2, 10L, null, null, null, null);

    @Test
    void rejectsAfterMaximumRequestsInWindow() {
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertTrue(algorithm.evaluate("client", config).allowed());
        assertFalse(algorithm.evaluate("client", config).allowed());
    }

    @Test
    void resetsCounterAtNextFixedWindowBoundary() {
        algorithm.evaluate("client", config);
        algorithm.evaluate("client", config);
        clock.advanceMillis(10_000);

        assertTrue(algorithm.evaluate("client", config).allowed());
    }
}
