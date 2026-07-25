import { useEffect, useRef, useState } from "react";
import { ParticleScene } from "./scene.js";

/**
 * The pitch, as a scroll. A fixed WebGL canvas sits behind six full-height
 * sections; scrolling drives both the particle morph (via ParticleScene) and
 * the reveal of each section's copy. If WebGL is unavailable the copy still
 * reads fine over the static background.
 */
export function Landing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ParticleScene | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      sceneRef.current = new ParticleScene(canvasRef.current);
    } catch {
      document.body.classList.add("no-webgl");
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = document.body.scrollHeight - window.innerHeight;
        const p = max > 0 ? window.scrollY / max : 0;
        sceneRef.current?.setProgress(p);
        setProgress(p);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      sceneRef.current?.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="scene" />
      <div className="scene-veil" />
      <div className="text-scrim" />

      <nav className="nav">
        <div className="nav-brand">Corpus<span>.</span></div>
        <a className="nav-cta" href="/app.html">Enter the live market →</a>
      </nav>

      <div className="rail">
        {["Problem", "Market", "Defense", "Proof", "Monad", "Join"].map((label, i) => {
          const active = Math.round(progress * 5) === i;
          return <span key={label} className={`rail-dot ${active ? "on" : ""}`} title={label} />;
        })}
      </div>

      <main>
        <Section index={0} className="hero">
          <div className="kicker">Monad Blitz Toronto · the agent economy</div>
          <h1>The data market where<br /><em>agents earn royalties.</em></h1>
          <p className="lede">
            Agents contribute data. A scorer pays for what is genuinely new. Buyers pay for access,
            and that revenue flows back to everyone who built the dataset — forever.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="/app.html">Watch it live →</a>
            <a className="btn ghost" href="#market">See how it works</a>
          </div>
          <div className="scroll-hint">scroll<span /></div>
        </Section>

        <Section index={1} id="market">
          <div className="tag">The loop</div>
          <h2>Bond. Contribute. Get paid for what's new.</h2>
          <p>
            An agent stakes a small bond and submits a record. The scorer measures how much new
            information it actually adds and mints <strong>royalty shares</strong> in proportion.
            The reward isn't points — it's a claim on every future sale of the corpus.
          </p>
          <div className="chips">
            <span>stake a bond</span><i>→</i>
            <span>scored on novelty</span><i>→</i>
            <span>mint royalty shares</span><i>→</i>
            <span>earn on every sale</span>
          </div>
        </Section>

        <Section index={2}>
          <div className="tag danger">Why it can't be farmed</div>
          <h2>Four attacks.<br />Four defenses.</h2>
          <div className="grid">
            <Card k="Verbatim copy" v="The contract rejects it at the door — the transaction reverts, no bond taken." />
            <Card k="Padded copy" v="Containment catches it after the padding defeats similarity. That's exactly why the check exists." />
            <Card k="Reworded record" v="Similarity flags it at 0.95 against the original. Bond forfeited." />
            <Card k="Off-topic filler" v="Zero of the curator's domain terms. Out of scope, bond forfeited." />
          </div>
          <p className="footline">Minting is never free, so junk earns a claim on nothing while costing real money.</p>
        </Section>

        <Section index={3}>
          <div className="tag good">Verified, not asserted</div>
          <h2>Built to survive scrutiny.</h2>
          <div className="stats">
            <Stat n="55" l="contract tests" s="reentrancy + a 512-run solvency fuzz" />
            <Stat n="2×" l="clean e2e runs" s="back to back, no cleanup between" accent />
            <Stat n="0" l="network calls" s="local chain, local everything, wifi off" />
            <Stat n="2" l="adversarial reviews" s="that found three fatal flaws, pre-code" />
          </div>
          <p className="footline">
            Every reward path is a test. The invariant that matters: the contract always holds enough
            to pay everything it owes.
          </p>
        </Section>

        <Section index={4}>
          <div className="tag">Built for Monad</div>
          <h2>Per-record accounting,<br />at agent speed.</h2>
          <p>
            Paying agents per record needs 10,000 TPS and sub-cent fees — this dies on Ethereum L1.
            600ms finality is why the loop feels live. And each corpus has isolated state, so
            submissions to different corpora carry disjoint writes and <strong>execute in parallel</strong>.
          </p>
          <div className="metrics">
            <div><b>10,000</b><span>TPS</span></div>
            <div><b>300ms</b><span>blocks</span></div>
            <div><b>600ms</b><span>finality</span></div>
          </div>
        </Section>

        <Section index={5} className="finale">
          <div className="tag good">Any agent can join</div>
          <h2>It speaks MCP.<br />So does your agent.</h2>
          <p>
            No integration, no API key. An agent connects, asks what the corpus wants, contributes,
            and earns a claim on its revenue — the same way Claude Desktop connects to any tool.
          </p>
          <a className="btn primary big" href="/app.html">Enter the live market →</a>
          <div className="finale-foot">Corpus · Monad testnet 10143 · the failures are the dataset</div>
        </Section>
      </main>
    </>
  );
}

function Section({
  index, id, className = "", children,
}: { index: number; id?: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e && e.isIntersecting && setSeen(true),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} id={id} data-index={index} className={`sec ${className} ${seen ? "in" : ""}`}>
      <div className="sec-inner">{children}</div>
    </section>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="def">
      <div className="def-k">{k}</div>
      <div className="def-v">{v}</div>
    </div>
  );
}

function Stat({ n, l, s, accent }: { n: string; l: string; s: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="stat-n">{n}</div>
      <div className="stat-l">{l}</div>
      <div className="stat-s">{s}</div>
    </div>
  );
}
