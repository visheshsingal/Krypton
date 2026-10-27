'use client';

import React, { useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [seatsNeeded, setSeatsNeeded] = useState(25);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; msg: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, seatsNeeded, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setStatus({ success: true, msg: data.message });
      setName('');
      setEmail('');
      setCompany('');
      setMessage('');
    } catch (err: any) {
      setStatus({ success: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-16 bg-white min-h-screen">
      <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <Mail className="w-3.5 h-3.5 text-emerald-600" />
            <span>Enterprise Consultation</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Request Architecture Demo</h1>
          <p className="text-xs text-slate-600">
            Talk to a Krypton security architect about custom seat quotas, offline policies, and enterprise deployment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
            <input
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Financial"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Approximate Employee Seats Needed</label>
            <select
              value={seatsNeeded}
              onChange={(e) => setSeatsNeeded(parseInt(e.target.value, 10))}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
            >
              <option value={10}>10 Seats</option>
              <option value={25}>25 Seats</option>
              <option value={50}>50 Seats</option>
              <option value={100}>100+ Seats</option>
              <option value={500}>500+ Enterprise Seats</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deployment Inquiries & Requirements</label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your AI tools (ChatGPT, Claude, Cursor) and internal compliance mandates..."
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {status && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
                status.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {status.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{status.msg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition flex items-center justify-center space-x-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? 'Submitting...' : 'Submit Architecture Request'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
