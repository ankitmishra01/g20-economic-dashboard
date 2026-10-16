export default function Loading() {
  return <div className="page"><div className="eyebrow">Loading intelligence</div><div className="skeleton skeleton--title" /><div className="grid grid--3">{[1,2,3].map((item) => <div className="skeleton skeleton--card" key={item} />)}</div></div>;
}
