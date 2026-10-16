"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="page"><p className="eyebrow">Partial service interruption</p><h1>The latest valid data is still available.</h1><p className="lede">A live source could not be reached. We never replace known-good observations with an empty refresh.</p><button className="button" onClick={reset}>Try the source again</button></div>;
}
