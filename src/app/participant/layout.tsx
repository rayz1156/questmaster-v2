export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  // Wrap all /participant routes in the accessibility-friendly class so
  // typography is larger and spacing is more comfortable for older eyes.
  return <div className="eyes-friendly">{children}</div>;
}
