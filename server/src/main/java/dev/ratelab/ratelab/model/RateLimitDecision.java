package dev.ratelab.ratelab.model;

public record RateLimitDecision(
    AlgorithmType algorithm,
    boolean allowed,
    long remaining,
    long retryAfterMillis
) {}