# Getting Started with Ignis

Welcome to Ignis — a TypeScript framework that combines enterprise architecture patterns with Hono's blazing performance. Whether you're building a SaaS backend, REST API, or microservice, these guides will take you from installation to production-ready code with type-safe database operations, auto-generated OpenAPI docs, and clean dependency injection.

<div class="guide-cards">

<a href="./get-started/setup" class="guide-card">
<span class="guide-icon">🛠️</span>
<h3>Setup</h3>
<p>Install Bun, PostgreSQL, and configure your IDE</p>
</a>

<a href="./get-started/5-minute-quickstart" class="guide-card highlight">
<span class="guide-icon">⚡</span>
<h3>5-Min Quickstart</h3>
<p>Your first endpoint in 5 minutes</p>
</a>

<a href="./tutorials/complete-installation" class="guide-card">
<span class="guide-icon">📦</span>
<h3>Full Installation</h3>
<p>Production-ready project setup</p>
</a>

<a href="./tutorials/building-a-crud-api" class="guide-card">
<span class="guide-icon">🗄️</span>
<h3>Build a CRUD API</h3>
<p>Complete Todo API with database</p>
</a>

<a href="./tutorials/testing" class="guide-card">
<span class="guide-icon">🧪</span>
<h3>Testing</h3>
<p>Write tests for your application</p>
</a>

<a href="./get-started/philosophy" class="guide-card">
<span class="guide-icon">💡</span>
<h3>Philosophy</h3>
<p>Why Ignis? Design decisions explained</p>
</a>

</div>

## Learning Roadmap

<div class="roadmap">

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">1</span>
<h4>First Steps</h4>
</div>
<p><a href="./get-started/setup">Setup</a> → <a href="./get-started/5-minute-quickstart">5-Min Quickstart</a></p>
<span class="stage-desc">Get your environment ready and build your first endpoint</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">2</span>
<h4>Build Something Real</h4>
</div>
<p><a href="./tutorials/complete-installation">Full Installation</a> → <a href="./tutorials/building-a-crud-api">CRUD API</a> → <a href="./tutorials/testing">Testing</a></p>
<span class="stage-desc">Create a complete API with database, validation, and tests</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">3</span>
<h4>Understand the Framework</h4>
</div>
<p><a href="./core-concepts/application">Application</a> → <a href="./core-concepts/controllers">Controllers</a> → <a href="./core-concepts/services">Services</a> → <a href="./core-concepts/dependency-injection">DI</a></p>
<span class="stage-desc">Deep dive into core concepts and architecture patterns</span>
</div>

<div class="roadmap-stage">
<div class="stage-header">
<span class="stage-num">4</span>
<h4>Go to Production</h4>
</div>
<p><a href="/best-practices/">Best Practices</a> → <a href="/references/">API Reference</a></p>
<span class="stage-desc">Learn patterns, security, performance, and deployment</span>
</div>

</div>

::: tip New to backend development?
Check out our [Glossary](./reference/glossary) for explanations of key terms like Controllers, Repositories, and Dependency Injection.
:::

<style>
.guide-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 2rem 0;
}

@media (min-width: 640px) {
  .guide-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .guide-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

.guide-card {
  display: block;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  text-decoration: none !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.guide-card h3,
.guide-card p {
  text-decoration: none !important;
}

.guide-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  text-decoration: none !important;
}

.guide-card.highlight {
  border: 2px solid var(--vp-c-brand-1);
}

.guide-icon {
  font-size: 1.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

.guide-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.guide-card p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.roadmap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1.5rem 0;
}

.roadmap-stage {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-brand-1);
}

.stage-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.stage-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
}

.stage-header h4 {
  margin: 0;
  font-size: 1rem;
}

.roadmap-stage > p {
  margin: 0 0 0.25rem 0;
  font-size: 0.9rem;
}

.stage-desc {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}
</style>
