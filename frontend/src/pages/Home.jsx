import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { BookOpen, CircleCheck, FileText, Filter, Search, Workflow, ShieldCheck, Users, BarChart3, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRolePlan } from '../lib/portalFeatures';
import { PORTAL } from '../lib/roles';
import client from '../api/client';
import { parseApiError } from '../utils/apiError';
import { BRAND } from '../lib/brand';

const cards = [
    {
        title: 'Processes',
        desc: 'Runbooks and operational playbooks.',
        icon: <Workflow className="w-6 h-6" />,
        to: '/portal/knowledge/playbooks',
    },
    {
        title: 'Application Modules',
        desc: 'Ownership, architecture, and troubleshooting.',
        icon: <BookOpen className="w-6 h-6" />,
        to: '/portal/knowledge/modules',
    },
    {
        title: 'Regulatory & policy',
        desc: 'Banking and policy articles by domain.',
        icon: <FileText className="w-6 h-6" />,
        to: '/portal/knowledge',
    },
    {
        title: 'Team Knowledge',
        desc: 'FAQs and team-specific notes.',
        icon: <UsersRound className="w-6 h-6" />,
        to: '/portal/knowledge/team-knowledge',
    },
];

const roleResponsibilities = [
    {
        role: 'Knowledge Admin',
        responsibility: 'Taxonomy, review workflow, and publication quality.',
    },
    {
        role: 'Domain Expert',
        responsibility: 'Validate deep domain content; flag stale material.',
    },
    {
        role: 'Employee',
        responsibility: 'Search guides and use the assistant for day-to-day work.',
    },
    {
        role: 'System Admin',
        responsibility: 'Access controls, security posture, and platform health.',
    },
];

const coreFeatures = [
    { title: 'Content Management', desc: 'Draft → review → publish; versions and expiry.', icon: <Workflow className="w-5 h-5" /> },
    { title: 'Search & Discovery', desc: 'Keyword + semantic search with domain filters.', icon: <Search className="w-5 h-5" /> },
    { title: 'RAG Assistant', desc: 'Answers grounded on internal documents with citations.', icon: <ShieldCheck className="w-5 h-5" /> },
    { title: 'Analytics & Feedback', desc: 'Gaps, ratings, and usage signals for admins.', icon: <BarChart3 className="w-5 h-5" /> },
];

const knowledgeDomains = [
    'Banking — AML/KYC, products, compliance',
    'Applications — modules, APIs, releases',
    'Processes — SOPs, runbooks, incidents',
    'Team — FAQs and onboarding notes',
];

const Home = () => {
    const { user } = useAuth();
    const plan = getRolePlan(user?.role);
    const [query, setQuery] = useState('');
    const [domain, setDomain] = useState('');
    const [results, setResults] = useState([]);
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const portalPath = {
        [PORTAL.KNOWLEDGE]: '/portal/knowledge',
        [PORTAL.ADMIN]: '/portal/admin',
    };

    const runSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        setStatus('');
        try {
            const payload = {
                query,
                top_k: 8,
                filters: domain ? { domain } : {},
            };
            const { data } = await client.post('/search', payload);
            setResults(data.results || []);
            if (!data.results?.length) {
                setStatus('No results found. Try a broader query or different domain filter.');
            }
        } catch (err) {
            const parsed = parseApiError(err, 'Search request failed.');
            setStatus(parsed || 'Search request failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
    <>
        <Helmet>
            <title>{`${BRAND.name} — ${BRAND.tagline}`}</title>
        </Helmet>
    <div className="pt-8 pb-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="panel">
                <p className="text-sm uppercase tracking-wide text-accent font-semibold mb-4">{BRAND.name} · {BRAND.tagline}</p>
                <h1 className="text-4xl md:text-5xl font-display font-bold text-primary mb-4">Knowledge workspace</h1>
                <p className="text-gray-600 dark:text-slate-300 text-lg max-w-3xl">
                    {BRAND.heroBody} Answers should cite sources you can open.
                </p>
                <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-5">
                    <p className="text-xs uppercase tracking-wide text-primary font-semibold">Your role plan</p>
                    <h2 className="text-xl font-semibold text-primary mt-1">{plan.label}</h2>
                    <p className="text-sm text-gray-700 dark:text-slate-300 mt-1">{plan.focus}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {plan.portals.map((p) => (
                            <Link key={p} to={portalPath[p]} className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-primary/20 text-primary dark:text-slate-100 text-xs font-medium transition-colors hover:bg-primary hover:text-white">
                                {p} portal
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="mt-8 grid md:grid-cols-3 gap-4">
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><Search className="w-5 h-5 text-primary" /> Structured search</div>
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><Filter className="w-5 h-5 text-primary" /> Domain and team filters</div>
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><CircleCheck className="w-5 h-5 text-primary" /> Source traceability</div>
                </div>
            </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <div className="panel mb-8">
                <h2 className="text-xl font-semibold text-primary mb-3">Search & Discovery</h2>
                <form onSubmit={runSearch} className="grid md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label htmlFor="knowledge-query" className="form-label">Search query</label>
                        <input
                            id="knowledge-query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g. OFAC screening failure flow"
                            className="input-field"
                            aria-describedby="knowledge-query-help"
                        />
                        <p id="knowledge-query-help" className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Business terms, modules, or process steps.
                        </p>
                    </div>
                    <div>
                        <label htmlFor="knowledge-domain" className="form-label">Domain filter</label>
                        <select
                            id="knowledge-domain"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            className="select-field"
                        >
                            <option value="">All domains</option>
                            <option value="banking">Banking domain</option>
                            <option value="application">Application knowledge</option>
                            <option value="process">Process docs</option>
                            <option value="tribal">Team knowledge</option>
                        </select>
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'Searching...' : 'Run Search'}
                    </button>
                </form>
                {status ? <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">{status}</p> : null}
                {results.length ? (
                    <div className="mt-4 grid gap-3">
                        {results.map((item) => (
                            <article key={item.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/60">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Score: {Number(item.score || 0).toFixed(3)}</p>
                                <p className="text-sm text-slate-700 dark:text-slate-200">{item.snippet}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Domain: {item.metadata?.domain || 'n/a'} · Owner: {item.metadata?.owner || 'n/a'}</p>
                            </article>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="panel">
                <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold text-primary">Roles & Responsibilities</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    {roleResponsibilities.map((item) => (
                        <article key={item.role} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
                            <h3 className="font-semibold text-primary">{item.role}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{item.responsibility}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid md:grid-cols-2 xl:grid-cols-4 gap-6">
            {cards.map((card) => (
                <Link key={card.title} to={card.to} className="card-hover panel-hover p-6 block">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">{card.icon}</div>
                    <h2 className="text-xl font-semibold text-primary mb-2">{card.title}</h2>
                    <p className="text-gray-600 dark:text-slate-300">{card.desc}</p>
                </Link>
            ))}
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid lg:grid-cols-2 gap-6">
            <div className="panel">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold text-primary">Platform capabilities</h2>
                </div>
                <div className="space-y-3">
                    {coreFeatures.map((f) => (
                        <article key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <div className="flex items-center gap-2 text-primary mb-1">{f.icon}<h3 className="font-semibold">{f.title}</h3></div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
                        </article>
                    ))}
                </div>
            </div>
            <div className="panel">
                <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold text-primary">Content domains</h2>
                </div>
                <ul className="space-y-3">
                    {knowledgeDomains.map((domain) => (
                        <li key={domain} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            {domain}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    </div>
    </>
);
};

export default Home;
