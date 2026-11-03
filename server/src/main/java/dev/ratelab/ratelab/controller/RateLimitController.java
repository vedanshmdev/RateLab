package dev.ratelab.ratelab.controller;

import dev.ratelab.ratelab.model.EvaluateRequest;
import dev.ratelab.ratelab.model.RateLimitDecision;
import dev.ratelab.ratelab.services.RateLimitService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rate-limits")
public class RateLimitController {
    private final RateLimitService rateLimitService;

    public RateLimitController(RateLimitService rateLimitService) {
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/evaluate")
    public ResponseEntity<RateLimitDecision> evaluate(@Valid @RequestBody EvaluateRequest request) {
        return ResponseEntity.ok(rateLimitService.evaluate(request));
    }
}
