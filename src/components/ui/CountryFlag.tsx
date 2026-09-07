const flags = import.meta.glob<string>("../../assets/flags/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export function CountryFlag({ countryCode }: { countryCode: string }) {
  const src = flags[`../../assets/flags/${countryCode.toLowerCase()}.svg`];
  if (!src) return null;
  return <img src={src} alt="" aria-hidden="true" width={20} height={15} className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-white/10" />;
}
