import { skalaBar, skalaGaris, titikSvg } from "@/lib/uiKit";

/**
 * Carta kit UI (KZ-021): SVG tulis sendiri, tiada pustaka.
 *
 * BarChart: bar #e5e9ff, bar sorotan/aktif #6576ff, paksi 11px #8094ae.
 * LineChart: garis #798bff, kawasan bawah ungu lembut #ebe2ff,
 * paksi 11px #8094ae.
 */

export type BarChartData = { label: string; nilai: number };

export function BarChart({
  data,
  tinggi = 160,
  /** Indeks bar yang disorot (#6576ff); -1 tiada. */
  aktif = -1,
  formatNilai,
  labelAks,
  className = "",
}: {
  data: BarChartData[];
  tinggi?: number;
  aktif?: number;
  /** Format teks nilai atas bar (contoh: "1.2k"). */
  formatNilai?: (n: number) => string;
  /** Label paksi untuk pembaca skrin. */
  labelAks: string;
  className?: string;
}) {
  const bar = skalaBar(data, (r) => r.label, (r) => r.nilai, tinggi - 24, 4);
  const lebarBar = 36;
  const jarak = 16;
  const lebar = Math.max(bar.length * (lebarBar + jarak) + jarak, 100);

  return (
    <svg
      role="img"
      aria-label={labelAks}
      viewBox={`0 0 ${lebar} ${tinggi}`}
      className={`w-full ${className}`.trim()}
      style={{ height: tinggi }}
    >
      {/* Garis dasar paksi. */}
      <line
        x1="0"
        y1={tinggi - 18}
        x2={lebar}
        y2={tinggi - 18}
        stroke="#e5e9f2"
        strokeWidth="1"
      />
      {bar.map((b, i) => {
        const x = jarak + i * (lebarBar + jarak);
        const y = tinggi - 18 - b.tinggi;
        const warna = i === aktif ? "#6576ff" : "#e5e9ff";
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={lebarBar}
              height={Math.max(b.tinggi, 1)}
              rx="3"
              fill={warna}
            >
              <title>{`${b.label}: ${formatNilai ? formatNilai(b.nilai) : b.nilai}`}</title>
            </rect>
            <text
              x={x + lebarBar / 2}
              y={tinggi - 5}
              textAnchor="middle"
              fontSize="11"
              fill="#8094ae"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type LineChartData = { label: string; nilai: number };

export function LineChart({
  data,
  tinggi = 160,
  labelAks,
  className = "",
}: {
  data: LineChartData[];
  tinggi?: number;
  labelAks: string;
  className?: string;
}) {
  const lebar = 600;
  const padAtas = 10;
  const padBawah = 20;
  const nilai = data.map((d) => d.nilai);
  const min = Math.min(...nilai, 0);
  const maks = Math.max(...nilai, 0);
  const tinggiPlot = tinggi - padAtas - padBawah;

  const x = (i: number) => (data.length <= 1 ? 0 : titikSvg(i / (data.length - 1), lebar));
  const y = (n: number) => padAtas + titikSvg(1 - skalaGaris(n, min, maks), tinggiPlot);

  const titik = data.map((d, i) => `${x(i)},${y(d.nilai)}`).join(" ");
  const kawasan =
    data.length > 0
      ? `0,${padAtas + tinggiPlot} ${titik} ${x(data.length - 1)},${padAtas + tinggiPlot}`
      : "";

  return (
    <svg
      role="img"
      aria-label={labelAks}
      viewBox={`0 0 ${lebar} ${tinggi}`}
      className={`w-full ${className}`.trim()}
      style={{ height: tinggi }}
    >
      {data.length > 1 && (
        <polygon points={kawasan} fill="#ebe2ff" opacity="0.6" />
      )}
      {data.length > 1 && (
        <polyline
          points={titik}
          fill="none"
          stroke="#798bff"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.nilai)} r="3" fill="#798bff">
          <title>{`${d.label}: ${d.nilai}`}</title>
        </circle>
      ))}
      {data.map((d, i) =>
        i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? (
          <text
            key={`t${i}`}
            x={x(i)}
            y={tinggi - 5}
            textAnchor="middle"
            fontSize="11"
            fill="#8094ae"
          >
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
