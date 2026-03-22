export function Badge({
  text,
  color = "#22c55e",
}: { text: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        fontSize: 10,
        fontWeight: 600,
        borderRadius: 6,
        backgroundColor: color,
        color: "#111",
        marginRight: 6,
        verticalAlign: "middle",
      }}
    >
      {text}
    </span>
  )
}