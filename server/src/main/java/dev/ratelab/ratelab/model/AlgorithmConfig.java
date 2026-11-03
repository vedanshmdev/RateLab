package dev.ratelab.ratelab.model;

import jakarta.validation.constraints.Positive;

public record AlgorithmConfig(
    @Positive Integer maximumRequests,
    @Positive Long windowSeconds,
    @Positive Integer capacity,
    @Positive Integer refillTokens,
    @Positive Long refillPeriodSeconds,
    @Positive Double leakRatePerSecond
) {}