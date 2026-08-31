import { parseArgs } from "node:util";
import { seedRoutes } from "../../src/domain/route-planner";
import {
  ClientRequestSchema,
  makeReceipt,
  retrieveRoute,
  terminalReceipt,
  writeReceipt,
} from "./client";

async function main() {
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "objective",
        "budget",
        "policy",
        "endpoint",
        "transport",
        "output",
        "fixture",
      ].map((name) => [name, { type: "string" as const }]),
    ),
  });
  if (values.fixture && values.fixture !== "unsafe-execution-enabled")
    throw new Error("unsupported_fixture");
  const request = ClientRequestSchema.parse({
    objective:
      values.objective ?? "Build a verified startup due-diligence route",
    budgetUsd: Number(values.budget ?? "0.25"),
    policy: values.policy ?? "most_verified",
    endpoint: values.endpoint ?? "https://signalforge-rose-two.vercel.app",
    transport: values.transport ?? "rest",
  });
  let raw: unknown, failure: string | undefined;
  if (values.fixture)
    raw = {
      ...seedRoutes()[0],
      executionStatus: "execution_enabled",
      provenance: {
        isSimulated: true,
        servicesCalled: true,
        paymentsMade: false,
      },
    };
  else
    try {
      raw = await retrieveRoute(request);
    } catch {
      failure = "planning_request_failed";
    }
  const { receipt, route } = makeReceipt(request, raw, failure);
  const output = values.output ?? `./route-receipt-${receipt.receiptId}.json`;
  await writeReceipt(output, receipt);
  console.log(terminalReceipt(receipt, route));
  console.log(`Receipt written (exclusive create). ID: ${receipt.receiptId}`);
  if (receipt.contractValidation === "refused") process.exitCode = 2;
}
main().catch(() => {
  console.error(
    "Client demo stopped safely. Check arguments, endpoint availability and whether the output file already exists. No execution occurred.",
  );
  process.exitCode = 1;
});
