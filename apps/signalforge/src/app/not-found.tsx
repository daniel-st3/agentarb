import { ActionLink } from "@/components/ui";
export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">404 / OFF THE ROUTE</p>
      <h1>This page isn’t in the plan.</h1>
      <ActionLink href="/forge">Start a research brief</ActionLink>
    </div>
  );
}
