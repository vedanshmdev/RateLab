package dev.ratelab.ratelab.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/api/health")
    public HealthResponse health() {
        return new HealthResponse("UP", "RateLab API is running");
    }

    public record HealthResponse(
        String status,
        String message
    ) {}
}