import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle, FileText, Filter, Search, Workflow, ShieldCheck, Users, BarChart3, UsersRound, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRolePlan } from '../lib/portalFeatures';
import { getPortalLabel, PORTAL } from '../lib/roles';
import client from '../api/client';
import { parseApiError } from '../utils/apiError';
import { BRAND } from '../lib/brand';

const cards = [
    {
        title: 'Processes',
        desc: 'Runbooks and operational playbooks.',
        icon: <Workflow className="w-6 h-6" />,
        to: '/portal/knowledge?domain=process',
    },
    {
        title: 'Application Modules',
        desc: 'Ownership, architecture, and troubleshooting.',
        icon: <BookOpen className="w-6 h-6" />,
        to: '/portal/knowledge?domain=application',
    },
    {
        title: 'Regulatory & Policy',
        desc: 'Banking and policy articles by domain.',
        icon: <FileText className="w-6 h-6" />,
        to: '/portal/knowledge?domain=banking',
    },
    {
        title: 'Team Resources',
        desc: 'Internal notes and team-specific guides.',
        icon: <UsersRound className="w-6 h-6" />,
        to: '/portal/knowledge?domain=tribal',
    },
];

const roleResponsibilities = [
    {
        role: 'Content Manager',
        responsibility: 'Policy organization, review workflows, and publication quality.',
    },
    {
        role: 'Subject Matter Expert',
        responsibility: 'Validate domain-specific content and ensure accuracy.',
    },
    {
        role: 'Banking Professional',
        responsibility: 'Search procedures and use the AI assistant for daily tasks.',
    },
    {
        role: 'Platform Administrator',
        responsibility: 'Security management, access oversight, and system health.',
    },
];

const coreFeatures = [
    { title: 'Governance', desc: 'Drafting, peer review, and publishing lifecycle.', icon: <Workflow className="w-5 h-5" /> },
    { title: 'Intelligent Search', desc: 'Semantic search with domain-specific filtering.', icon: <Search className="w-5 h-5" /> },
    { title: 'AI Assistant', desc: 'Instant answers grounded in verified documentation.', icon: <ShieldCheck className="w-5 h-5" /> },
    { title: 'Insights', desc: 'Usage patterns and knowledge gap identification.', icon: <BarChart3 className="w-5 h-5" /> },
];

const knowledgeDomains = [
    'Banking — AML/KYC, products, and compliance',
    'Platform — internal systems and architecture',
    'Procedures — SOPs, runbooks, and operations',
    'Internal — FAQs and onboarding resources',
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
        [PORTAL.PROFILE]: '/portal/profile',
        [PORTAL.ADMIN]: '/portal/admin',
    };
    const permittedPortals = Array.isArray(user?.portals) ? user.portals : plan.portals;

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
            <div className="panel overflow-hidden">
                <p className="text-xs sm:text-sm uppercase tracking-wide text-accent font-semibold mb-4 break-words">{BRAND.name} · {BRAND.tagline}</p>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-primary mb-4 leading-tight">Knowledge workspace</h1>
                <p className="text-gray-600 dark:text-slate-300 text-base sm:text-lg max-w-3xl">
                    {BRAND.heroBody} Answers should cite sources you can open.
                </p>
                <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-5">
                    <p className="text-xs uppercase tracking-wide text-primary font-semibold">Your account type</p>
                    <h2 className="text-xl font-semibold text-primary mt-1">{plan.label}</h2>
                    <p className="text-sm text-gray-700 dark:text-slate-300 mt-1">{plan.focus}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {permittedPortals.map((p) => (
                            <Link key={p} to={portalPath[p]} className="max-w-full break-words px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-primary/20 text-primary dark:text-slate-100 text-xs font-medium transition-colors hover:bg-primary hover:text-white">
                                {getPortalLabel(user, p, p)} portal
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="mt-8 grid md:grid-cols-3 gap-4">
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><Search className="w-5 h-5 text-primary shrink-0" /> <span className="min-w-0">Structured search</span></div>
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><Filter className="w-5 h-5 text-primary shrink-0" /> <span className="min-w-0">Domain and team filters</span></div>
                    <div className="bg-background dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3"><CheckCircle className="w-5 h-5 text-primary shrink-0" /> <span className="min-w-0">Source traceability</span></div>
                </div>
            </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <div className="panel mb-8">
                <h2 className="text-xl font-semibold text-primary mb-3">Search & Discovery</h2>
                <form onSubmit={runSearch} className="grid gap-3 md:grid-cols-4 md:items-end">
                    <div className="min-w-0 md:col-span-2">
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
                    <div className="min-w-0">
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
                    <button type="submit" disabled={loading} className="btn-primary w-full md:self-start md:mt-[1.625rem]">
                        {loading ? 'Searching...' : 'Run Search'}
                    </button>
                </form>
                {status ? <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 break-words">{status}</p> : null}
                {results.length ? (
                    <div className="mt-4 space-y-3">
                        {results.map((item) => (
                            <article key={item.id} className="min-w-0 border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/60">
                                <p className="text-sm text-slate-700 dark:text-slate-200 break-words">{item.snippet}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 break-words">Domain: {item.metadata?.domain || 'n/a'} · Owner: {item.metadata?.owner || 'n/a'}</p>
                            </article>
                        ))}
                        <div className="pt-2">
                            <Link 
                                to={`/portal/knowledge?q=${encodeURIComponent(query)}&domain=${domain}`} 
                                className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                            >
                                <span className="min-w-0 truncate">View all results</span>
                                <ArrowRight className="w-4 h-4 shrink-0" />
                            </Link>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="panel">
                <div className="flex items-start gap-2 mb-4">
                    <Users className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h2 className="text-xl font-semibold text-primary leading-snug">Roles & Responsibilities</h2>
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
                <Link key={card.title} to={card.to} className="card-hover panel-hover p-5 sm:p-6 block min-w-0">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 shrink-0">{card.icon}</div>
                    <h2 className="text-xl font-semibold text-primary mb-2">{card.title}</h2>
                    <p className="text-gray-600 dark:text-slate-300 break-words">{card.desc}</p>
                </Link>
            ))}
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid lg:grid-cols-2 gap-6">
            <div className="panel">
                <div className="flex items-start gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h2 className="text-xl font-semibold text-primary leading-snug">Platform capabilities</h2>
                </div>
                <div className="space-y-3">
                    {coreFeatures.map((f) => (
                        <article key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <div className="flex items-start gap-2 text-primary mb-1">{React.cloneElement(f.icon, { className: `${f.icon.props.className || ''} shrink-0 mt-0.5` })}<h3 className="font-semibold leading-snug">{f.title}</h3></div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 break-words">{f.desc}</p>
                        </article>
                    ))}
                </div>
            </div>
            <div className="panel">
                <div className="flex items-start gap-2 mb-4">
                    <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h2 className="text-xl font-semibold text-primary leading-snug">Content domains</h2>
                </div>
                <ul className="space-y-3">
                    {knowledgeDomains.map((domain) => (
                        <li key={domain} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            <span className="min-w-0 break-words">{domain}</span>
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
