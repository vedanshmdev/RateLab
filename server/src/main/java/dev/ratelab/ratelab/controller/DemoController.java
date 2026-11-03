package dev.ratelab.ratelab.controller;

import dev.ratelab.ratelab.model.EvaluateRequest;
import dev.ratelab.ratelab.model.RateLimitDecision;
import dev.ratelab.ratelab.services.RateLimitService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/demo")
public class DemoController {
    private final RateLimitService rateLimitService;

    public DemoController(RateLimitService rateLimitService) {
        this.rateLimitService = rateLimitService;
    }

    @PostMapping("/request")
    public ResponseEntity<RateLimitDecision> sendRequest(@Valid @RequestBody EvaluateRequest request) {
        RateLimitDecision decision = rateLimitService.evaluate(request);
        if (decision.allowed()) {
            return ResponseEntity.ok(decision);
        }

        long retryAfterSeconds = Math.max(1, (decision.retryAfterMillis() + 999) / 1_000);
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds))
            .body(decision);
    }
}
