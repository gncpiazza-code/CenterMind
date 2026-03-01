export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };
  return (
    <span
      className={`${sizes[size]} border-2 border-[var(--shelfy-border)] border-t-[var(--shelfy-primary)] rounded-full animate-spin inline-block`}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Spinner size="lg" />
    </div>
  );
}
