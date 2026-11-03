package dev.ratelab.ratelab.algorithms;

import dev.ratelab.ratelab.model.AlgorithmConfig;
import dev.ratelab.ratelab.model.AlgorithmType;
import dev.ratelab.ratelab.model.RateLimitDecision;

public interface RateLimiterAlgorithm {
    AlgorithmType type();

    RateLimitDecision evaluate(String clientId, AlgorithmConfig config);
}