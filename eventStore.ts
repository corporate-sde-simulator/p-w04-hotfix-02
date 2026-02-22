/**
 * ====================================================================
 *  JIRA: PLATFORM-2892 — Fix Event Sourcing Replay Bug
 * ====================================================================
 *  Priority: P1 | Points: 3 | Labels: event-sourcing, typescript
 *
 *  Events are replayed in insertion order but some arrive out of
 *  sequence (network delay). Also missing idempotency key causes
 *  duplicate events to be applied twice.
 *
 *  FAILING TESTS:
 *  - test_replay_ordering: events applied out of timestamp order
 *  - test_duplicate_event: balance doubled on retry
 *
 *  ACCEPTANCE CRITERIA:
 *  - [ ] Events sorted by timestamp before replay
 *  - [ ] Duplicate events (same eventId) are skipped
 *  - [ ] Aggregate state is correct after replay
 * ====================================================================
 */

interface DomainEvent {
    eventId: string;
    aggregateId: string;
    type: string;
    data: any;
    timestamp: number;
    version: number;
}

class EventStore {
    private events: DomainEvent[] = [];
    private appliedIds: Set<string> = new Set();

    append(event: DomainEvent): void {
        // BUG: No duplicate check — same event can be appended multiple times
        // Should check if eventId already exists
        this.events.push(event);
    }

    getEvents(aggregateId: string): DomainEvent[] {
        // BUG: Returns events in insertion order, not timestamp order
        // Network delays can cause out-of-order insertion
        return this.events.filter(e => e.aggregateId === aggregateId);
    }

    replay(aggregateId: string): any {
        const events = this.getEvents(aggregateId);
        let state: any = { balance: 0, transactions: [] };

        for (const event of events) {
            // BUG: No idempotency check — duplicate events are applied
            // Should skip if eventId already in appliedIds
            state = this.applyEvent(state, event);
        }

        return state;
    }

    private applyEvent(state: any, event: DomainEvent): any {
        switch (event.type) {
            case 'CREDIT':
                return {
                    ...state, balance: state.balance + event.data.amount,
                    transactions: [...state.transactions, event]
                };
            case 'DEBIT':
                return {
                    ...state, balance: state.balance - event.data.amount,
                    transactions: [...state.transactions, event]
                };
            default:
                return state;
        }
    }
}

// Tests
const store = new EventStore();
store.append({ eventId: "e1", aggregateId: "acc-1", type: "CREDIT", data: { amount: 100 }, timestamp: 1000, version: 1 });
store.append({ eventId: "e1", aggregateId: "acc-1", type: "CREDIT", data: { amount: 100 }, timestamp: 1000, version: 1 }); // duplicate!
store.append({ eventId: "e2", aggregateId: "acc-1", type: "DEBIT", data: { amount: 30 }, timestamp: 900, version: 2 }); // earlier timestamp!

const state = store.replay("acc-1");
console.assert(state.balance === 70, `FAIL: balance should be 70, got ${state.balance}`);
console.log("Event sourcing tests complete");

export { EventStore, DomainEvent };
