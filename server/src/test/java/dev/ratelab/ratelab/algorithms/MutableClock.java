package dev.ratelab.ratelab.algorithms;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

final class MutableClock extends Clock {
    private long millis;

    MutableClock(long initialMillis) {
        this.millis = initialMillis;
    }

    void advanceMillis(long amount) {
        millis += amount;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }

    @Override
    public Instant instant() {
        return Instant.ofEpochMilli(millis);
    }

    @Override
    public long millis() {
        return millis;
    }
}
