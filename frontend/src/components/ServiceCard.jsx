import React from 'react';

const ServiceCard = ({ icon, title, description, badge }) => {
    return (
        <div className="card-hover p-8 relative flex flex-col h-full bg-white group">
            {badge && (
                <div className="absolute top-0 right-0 bg-accent/10 text-accent font-semibold px-4 py-2 rounded-bl-xl text-sm border-l border-b border-accent/20">
                    {badge}
                </div>
            )}

            <div className="bg-primary/5 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shadow-sm">
                {icon}
            </div>

            <h3 className="text-xl font-bold text-primary mb-4">{title}</h3>
            <p className="text-gray-600 dark:text-slate-300 leading-relaxed mb-6 flex-grow">{description}</p>

            <button className="text-primary font-semibold flex items-center gap-2 group-hover:text-accent transition-colors mt-auto w-fit">
                Learn More
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
            </button>
        </div>
    );
};

export default ServiceCard;
