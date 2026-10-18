import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { functions } from '@/inngest/functions';

// Inngest calls this route to run our functions. It carries no session: requests are
// authenticated by the Inngest signature (INNGEST_SIGNING_KEY), which is why
// middleware.ts lets it through.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
