import React from 'react';

const ServiceCard = ({ icon, title, description, badge }) => {
    return (
        <div className="card-hover relative flex h-full flex-col overflow-hidden bg-white p-5 group sm:p-8">
            {badge && (
                <div className="absolute right-0 top-0 max-w-[70%] rounded-bl-xl border-b border-l border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent break-words sm:px-4 sm:py-2 sm:text-sm">
                    {badge}
                </div>
            )}

            <div className="bg-primary/5 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shadow-sm">
                {icon}
            </div>

            <h3 className="text-lg font-bold text-primary mb-3 break-words sm:text-xl sm:mb-4">{title}</h3>
            <p className="text-gray-600 dark:text-slate-300 leading-relaxed mb-6 flex-grow">{description}</p>

            <button className="text-primary font-semibold flex max-w-full items-center gap-2 group-hover:text-accent transition-colors mt-auto w-fit">
                Learn More
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </button>
        </div>
    );
};

export default ServiceCard;
