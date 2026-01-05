// Approve deposit
export async function approveDeposit(
  userId: number,
  transactionId: string
) {
  const response = await fetch(
    `http://localhost:8080/restate/workflow/deposit/${transactionId}/depositRequestConfirmed/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: true,
        approvedAt: Date.now(),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to approve deposit: ${response.statusText}`);
  }

  return await response.json();
}

// Reject/Cancel deposit
export async function rejectDeposit(
  userId: number,
  transactionId: string,
  reason?: string
) {
  const response = await fetch(
    `http://localhost:8080/restate/workflow/deposit/${transactionId}/depositRequestConfirmed/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: false,
        approvedAt: Date.now(),
        reason: reason || "Deposit rejected by admin",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to reject deposit: ${response.statusText}`);
  }

  return await response.json();
}

// Cancel deposit (same as reject but different reason)
export async function cancelDeposit(
  userId: number,
  transactionId: string,
  reason?: string
) {
  const response = await fetch(
    `http://localhost:8080/restate/workflow/deposit/${transactionId}/depositRequestConfirmed/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: false,
        approvedAt: Date.now(),
        reason: reason || "Deposit cancelled by user",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to cancel deposit: ${response.statusText}`);
  }

  return await response.json();
}