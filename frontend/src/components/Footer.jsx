import React from 'react';
import { Mail, Phone, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import StratumMark from './brand/StratumMark';

const Footer = () => {
    return (
        <footer className="bg-primary text-white pt-12 pb-6 border-t border-primary-light mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
                    <div>
                        <Link to="/" className="flex min-w-0 items-center gap-2 mb-6">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm shadow-black/5 ring-1 ring-black/5 shrink-0">
                                <StratumMark variant="tile" size={30} decorative />
                            </div>
                            <span className="min-w-0 truncate text-xl font-display font-bold tracking-tight text-white">{BRAND.name}</span>
                        </Link>
                        <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                            {BRAND.name} — {BRAND.tagline} Internal knowledge and RBAC-protected access.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-300">
                            <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                            RBAC enforced · Auditable activity
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-6 text-white border-b border-primary-light pb-2 inline-block">Support Desk</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3 text-gray-300 text-sm">
                                <Phone className="w-5 h-5 text-accent shrink-0" />
                                <span>+1 800 123 4567<br />+1 800 987 6543</span>
                            </li>
                            <li className="flex items-start gap-3 text-gray-300 text-sm">
                                <Mail className="w-5 h-5 text-accent shrink-0" />
                                <span className="break-all">{BRAND.supportEmail}</span>
                            </li>
                            <li className="flex items-start gap-3 text-gray-300 text-sm">
                                <MapPin className="w-5 h-5 text-accent shrink-0" />
                                <span>123 Financial District,<br />New York, NY 10004</span>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold mb-6 text-white border-b border-primary-light pb-2 inline-block">Governance Scope</h3>
                        <p className="text-gray-300 text-sm mb-4">
                            Banking domain knowledge, application documentation, process runbooks, and curated team guidance.
                        </p>
                        <ul className="space-y-2 text-sm text-gray-300">
                            <li>• Versioned content lifecycle (draft, review, publish)</li>
                            <li>• Search and discovery across all approved domains</li>
                            <li>• Analytics for knowledge gaps and adoption</li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-8 flex flex-col gap-4 text-center md:flex-row md:justify-between md:items-center md:text-left text-sm text-gray-400">
                    <p>© {new Date().getFullYear()} {BRAND.copyrightEntity}. All rights reserved.</p>
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 md:justify-end">
                        <Link to="/privacy" className="hover:text-accent transition-colors">Privacy Policy</Link>
                        <span className="hover:text-accent transition-colors">Terms of Service</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
