import { createBrunch, failInviteEmail, inviteToBrunch, uniqueSuffix } from '../support/factories';
import { expect, test } from '../support/fixtures';
import { expectBell, inboxRow } from '../support/inbox';
import { inviteRow } from '../support/invites';
import { waitForEmails } from '../support/mailbox';

// The words under test, in one place. They mirror `lib/notificationCopy.ts` on purpose.
const FAILED_NOTE = "That email didn't go through.";
const failedRow = (address: string): string => `Your invite to ${address} didn't go through`;

test.describe("B8 — the host is told when an invite's email did not go out", () => {
  test('the invite list and the inbox say so, the guest is never told, and a resend that goes clears both', async ({
    makeActor,
  }) => {
    // a real queue run and an email wait on top of the sign-ins: more than 30 s when the whole suite is running.
    test.slow();
    const host = await makeActor('host');
    const address = `rejected-${uniqueSuffix()}@example.com`;
    const brunchId = await createBrunch({
      host: host.user,
      title: `Bounced Brunch ${uniqueSuffix()}`,
    });
    await inviteToBrunch({ brunchId, host: host.user, invitees: [{ email: address }] });
    // The outbox never refuses, so the state the queue leaves when it gives up is seeded with the
    // real service; the way out below is the real resend through the real queue.
    await failInviteEmail({ brunchId, email: address });

    await host.page.goto(`/brunch/${brunchId}`);
    const row = inviteRow(host.page, address);
    await expect(row).toContainText(FAILED_NOTE);
    await expectBell(host.page, 1);

    await host.page.goto('/notifications');
    await expect(inboxRow(host.page, failedRow(address))).toBeVisible();

    // Opening it lands on the invite list, which says what to do.
    await inboxRow(host.page, failedRow(address)).click();
    await expect(host.page).toHaveURL(new RegExp(`/brunch/${brunchId}$`));
    await expect(inviteRow(host.page, address)).toContainText(FAILED_NOTE);

    // Resend: the email goes out through the queue, and what was said about it is taken back.
    await inviteRow(host.page, address).getByRole('button', { name: 'Resend' }).click();
    await waitForEmails({ to: address, count: 1 });
    await expect
      .poll(async () => {
        await host.page.reload();
        return inviteRow(host.page, address).innerText();
      })
      .not.toContain(FAILED_NOTE);

    await host.page.goto('/notifications');
    await expect(inboxRow(host.page, failedRow(address))).toHaveCount(0);
    await expectBell(host.page, 0);
  });
});
