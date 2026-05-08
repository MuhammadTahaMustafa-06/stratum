import React from 'react';
import { Boxes, Database, Server, UserCog } from 'lucide-react';
import client from '../api/client';

const modules = [
    { name: 'Customer Profile Service', owner: 'Retail Ops', status: 'Stable', notes: 'KYC and profile lifecycle management.' },
    { name: 'Loan Orchestrator', owner: 'Credit Team', status: 'Watch', notes: 'Decisioning and disbursal orchestration.' },
    { name: 'Transaction Core', owner: 'Payments Team', status: 'Stable', notes: 'Real-time posting and settlement.' },
    { name: 'Case Management', owner: 'Support Team', status: 'Improving', notes: 'Escalation workflows and audit trails.' },
];

const Application = () => {
    const [articles, setArticles] = React.useState([]);
    React.useEffect(() => {
        (async () => {
            const { data } = await client.get('/articles?domain=application&status=published');
            setArticles(data.items || []);
        })().catch(() => setArticles([]));
    }, []);

    return (
    <div className="pt-8 pb-16">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-primary mb-3">Application Modules</h1>
            <p className="text-gray-600 dark:text-slate-300 mb-8 max-w-3xl">
                Who owns what, how systems fit together, and where to look first when something breaks.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="panel py-4 px-4 flex gap-3 items-start"><Boxes className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">4 Core Modules</span></div>
                <div className="panel py-4 px-4 flex gap-3 items-start"><Server className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Ops-ready runbooks</span></div>
                <div className="panel py-4 px-4 flex gap-3 items-start"><Database className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Source-cited docs</span></div>
                <div className="panel py-4 px-4 flex gap-3 items-start"><UserCog className="w-5 h-5 text-primary shrink-0 mt-0.5" /> <span className="min-w-0 break-words">Named owners</span></div>
            </div>

            <div className="panel overflow-hidden p-0">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-background dark:bg-slate-800">
                        <tr>
                            <th className="px-5 py-3 text-sm text-gray-500 dark:text-slate-400">Module</th>
                            <th className="px-5 py-3 text-sm text-gray-500 dark:text-slate-400">Owner</th>
                            <th className="px-5 py-3 text-sm text-gray-500 dark:text-slate-400">Status</th>
                            <th className="px-5 py-3 text-sm text-gray-500 dark:text-slate-400">Knowledge Scope</th>
                        </tr>
                    </thead>
                    <tbody>
                        {modules.map((module) => (
                            <tr key={module.name} className="border-t border-gray-100 dark:border-slate-800">
                                <td className="px-5 py-4 font-medium text-primary">{module.name}</td>
                                <td className="px-5 py-4 text-gray-700 dark:text-slate-300">{module.owner}</td>
                                <td className="px-5 py-4 text-gray-700 dark:text-slate-300">{module.status}</td>
                                <td className="px-5 py-4 text-gray-700 dark:text-slate-300">{module.notes}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            <div className="mt-8 panel">
                <h2 className="text-xl font-semibold text-primary mb-3">Published Application Knowledge</h2>
                <div className="space-y-3">
                    {articles.map((a) => (
                        <article key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                            <h3 className="font-semibold text-primary break-words">{a.title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-3">{a.content}</p>
                        </article>
                    ))}
                    {!articles.length ? <p className="text-sm text-slate-500 dark:text-slate-400">No published application articles yet.</p> : null}
                </div>
            </div>
        </section>
    </div>
);
};

export default Application;
