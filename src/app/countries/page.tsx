import Link from "next/link";
import type { Route } from "next";
import { PageHeader } from "@/components/page-header";
import { g20Countries, observations } from "@/lib/repository";
export default function CountriesPage() {
  return <div className="page"><PageHeader eyebrow="Global directory · Tier 1 baseline" title="Countries" description="Start with supported G20 coverage, then expand through verified official-source mappings. Missing high-frequency series remain visible." /><div className="directory">{g20Countries.map((country) => { const count = observations.filter((row) => row.country === country.iso3).length; return <Link href={`/countries/${country.iso3}` as Route} key={country.iso3}><span className="directory__code">{country.iso3}</span><div><strong>{country.name}</strong><small>{country.region}</small></div><span>{count.toLocaleString()} observations</span><b>Tier {country.coverageTier}</b></Link>; })}</div></div>;
}
