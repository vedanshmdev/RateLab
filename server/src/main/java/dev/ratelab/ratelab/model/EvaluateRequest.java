package dev.ratelab.ratelab.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record EvaluateRequest(
    @NotBlank String clientId,
    @NotNull AlgorithmType algorithm,
    @NotNull @Valid AlgorithmConfig config
) {}