import { Inngest } from 'inngest';

// Mode, keys and the dev-server URL come from the environment (INNGEST_DEV,
// INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY), so there is nothing to configure here.
export const inngest = new Inngest({ id: 'brunchsters' });
