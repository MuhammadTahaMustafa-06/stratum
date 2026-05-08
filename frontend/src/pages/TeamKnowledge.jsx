import React from 'react';
import { Users, BookMarked, MessageSquareText } from 'lucide-react';
import client from '../api/client';

export default function TeamKnowledge() {
    const [articles, setArticles] = React.useState([]);

    React.useEffect(() => {
        (async () => {
            const { data } = await client.get('/articles?domain=tribal&status=published');
            setArticles(data.items || []);
        })().catch(() => setArticles([]));
    }, []);

    return (
        <div className="pt-8 pb-16">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h1 className="text-3xl sm:text-4xl font-display font-bold text-primary mb-3">Team Knowledge</h1>
                <p className="text-gray-600 dark:text-slate-300 mb-8 max-w-3xl">
                    Team FAQs, onboarding notes, and practical tips from the field.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    <div className="panel p-4 flex items-start gap-3">
                        <Users className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Team wiki summaries</span>
                    </div>
                    <div className="panel p-4 flex items-start gap-3">
                        <BookMarked className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Onboarding checkpoints</span>
                    </div>
                    <div className="panel p-4 flex items-start gap-3">
                        <MessageSquareText className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Curated FAQ extracts</span>
                    </div>
                </div>

                <div className="space-y-3">
                    {articles.map((a) => (
                        <article key={a.id} className="panel panel-hover p-4 sm:p-5 overflow-hidden">
                            <h2 className="font-semibold text-primary break-words">{a.title}</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1 line-clamp-3">{a.content}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 break-words">Category: {a.category || "General"} · Owner: {a.owner || "Unassigned"}</p>
                        </article>
                    ))}
                    {!articles.length ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No published team knowledge articles yet.</p>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
