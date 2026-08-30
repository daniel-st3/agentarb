"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Something interrupted this view.</h1>
      <p>No external services were called. Try loading the view again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
