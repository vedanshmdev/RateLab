package dev.ratelab.ratelab.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class RateLimitControllerTests {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void apiPreflightAllowsConfiguredFrontendOrigin() throws Exception {
        mockMvc.perform(options("/api/health")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, containsString("GET")));
    }

    @Test
    void playgroundEndpointReturnsDecisionEvenWhenRequestIsRejected() throws Exception {
        String request = """
            {
              "clientId": "playground-test-client",
              "algorithm": "FIXED_WINDOW_COUNTER",
              "config": { "maximumRequests": 1, "windowSeconds": 60 }
            }
            """;

        mockMvc.perform(post("/api/rate-limits/evaluate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").value(true));

        mockMvc.perform(post("/api/rate-limits/evaluate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allowed").value(false));
    }

    @Test
    void demoEndpointReturns429AndRetryAfterWhenLimitIsExceeded() throws Exception {
        String request = """
            {
              "clientId": "demo-test-client",
              "algorithm": "FIXED_WINDOW_COUNTER",
              "config": { "maximumRequests": 1, "windowSeconds": 60 }
            }
            """;

        mockMvc.perform(post("/api/demo/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/demo/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.allowed").value(false));
    }
}
