import React from 'react';
import { CheckCircle2, Workflow, AlertTriangle, LifeBuoy } from 'lucide-react';
import client from '../api/client';

const tracks = [
    {
        title: 'Incident Triage',
        steps: ['Validate customer/account context', 'Run module checks', 'Apply approved remediation', 'Document with citation'],
        icon: <AlertTriangle className="w-5 h-5" />,
    },
    {
        title: 'Day-1 Onboarding',
        steps: ['Understand domain glossary', 'Review system map', 'Complete SOP simulation', 'Request SME signoff'],
        icon: <LifeBuoy className="w-5 h-5" />,
    },
];

const About = () => {
    const [articles, setArticles] = React.useState([]);
    React.useEffect(() => {
        (async () => {
            const { data } = await client.get('/articles?domain=process&status=published');
            setArticles(data.items || []);
        })().catch(() => setArticles([]));
    }, []);

    return (
    <div className="pt-8 pb-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-display font-bold text-primary mb-3">Processes</h1>
            <p className="text-gray-600 dark:text-slate-300 mb-8 max-w-3xl">
                Repeatable flows for operations and troubleshooting — aligned to policy and module docs.
            </p>
            <div className="grid lg:grid-cols-2 gap-6">
                {tracks.map((track) => (
                    <article key={track.title} className="panel panel-hover">
                        <div className="flex items-center gap-2 text-primary mb-4">{track.icon}<h2 className="text-xl font-semibold">{track.title}</h2></div>
                        <ul className="space-y-3">
                            {track.steps.map((step) => (
                                <li key={step} className="flex items-start gap-2 text-gray-700 dark:text-slate-300">
                                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-1 shrink-0" />
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
            <div className="bg-slate-900 text-white rounded-2xl p-8 flex items-start gap-4 border border-slate-700">
                <Workflow className="w-6 h-6 mt-1 shrink-0" />
                <p className="text-lg">
                    Follow playbooks and validate against cited sources before customer-impacting changes.
                </p>
            </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <div className="panel">
                <h2 className="text-xl font-semibold text-primary mb-3">Published Process Articles</h2>
                <div className="space-y-3">
                    {articles.map((a) => (
                        <article key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white/80 dark:bg-slate-800/50">
                            <h3 className="font-semibold text-primary">{a.title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-3">{a.content}</p>
                        </article>
                    ))}
                    {!articles.length ? <p className="text-sm text-slate-500 dark:text-slate-400">No published process articles yet.</p> : null}
                </div>
            </div>
        </section>
    </div>
);
};

export default About;
