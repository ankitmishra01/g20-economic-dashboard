import Link from "next/link";
import type { Route } from "next";
import { PageHeader } from "@/components/page-header";
import { globalCountries, observations } from "@/lib/repository";
export default async function CountriesPage() {
  const countries = await globalCountries();
  return <div className="page"><PageHeader eyebrow={`Global directory · ${countries.length} economies`} title="Countries" description="Every official registry country is discoverable. Tier 1 has validated observation coverage; Tier 3 is registry-only until verified mappings are added." /><div className="directory">{countries.map((country) => { const count = observations.filter((row) => row.country === country.iso3).length; return <Link href={`/countries/${country.iso3}` as Route} key={country.iso3}><span className="directory__code">{country.iso3}</span><div><strong>{country.name}</strong><small>{country.region}</small></div><span>{count ? `${count.toLocaleString()} observations` : "Registry only"}</span><b>Tier {country.coverageTier}</b></Link>; })}</div></div>;
}
