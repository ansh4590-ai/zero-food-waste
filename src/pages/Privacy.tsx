import { ShieldCheck, User, Database, Lock, Server, Eye, Mail, LockKeyhole, HeartHandshake } from "lucide-react";

export default function Privacy() {
  return (
    <div className="bg-background pt-12 pb-12 text-foreground transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-6">
        
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2f6f57]/10 mb-6 border border-[#2f6f57]/20">
            <LockKeyhole className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your trust matters. We protect your data responsibly to ensure a safe, efficient, and transparent food rescue platform.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-12">
          
          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Database className="w-6 h-6 text-primary" /> A. Information We Collect
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Name & Email</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Phone Number</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Role (Donor, Receiver, Volunteer)</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Location data for pickups/deliveries</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Uploaded food images</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> KYC documents for verification</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> Usage analytics</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Eye className="w-6 h-6 text-primary" /> B. Why We Use It
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed">
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="text-[#10b981] font-bold">1.</span> Match food donations efficiently across the network.
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#10b981] font-bold">2.</span> Coordinate precise fleet pickups and deliveries.
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#10b981] font-bold">3.</span> Improve safety standards and prevent operational fraud.
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#10b981] font-bold">4.</span> Send critical dispatch and status notifications.
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#10b981] font-bold">5.</span> Analyze and improve platform performance.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Lock className="w-6 h-6 text-primary" /> C. Data Protection
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <h3 className="font-bold text-foreground mb-2">Secure Authentication</h3>
                   <p className="text-muted-foreground text-sm">Industry-standard JWT tokens and secure sessions are employed across our platform.</p>
                 </div>
                 <div>
                   <h3 className="font-bold text-foreground mb-2">Encrypted Storage</h3>
                   <p className="text-muted-foreground text-sm">Sensitive KYC documents and personal data use at-rest encryption.</p>
                 </div>
                 <div>
                   <h3 className="font-bold text-foreground mb-2">Restricted Access</h3>
                   <p className="text-muted-foreground text-sm">Only authorized verified admins can view operational audits.</p>
                 </div>
                 <div>
                   <h3 className="font-bold text-foreground mb-2">No Data Selling</h3>
                   <p className="text-muted-foreground text-sm">We strictly never sell your personal data to third-party ad networks.</p>
                 </div>
               </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Server className="w-6 h-6 text-primary" /> D. Third-Party Services
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground">
               <p className="mb-4">To provide reliable logistics and AI features, we utilize trusted cloud vendors:</p>
               <div className="flex flex-wrap gap-3 mt-4">
                 <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium">Supabase Database Storage</span>
                 <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium">Maps & Location Routing APIs</span>
                 <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-medium">AI Image & KYC Processing</span>
               </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <User className="w-6 h-6 text-primary" /> E. User Rights
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground">
               <p>You have full ownership of your data on Zero Food Waste. You maintain the right to:</p>
               <ul className="list-disc pl-5 mt-4 space-y-2">
                 <li>Request profile and data updates.</li>
                 <li>Request full account deletion via your dashboard or support.</li>
                 <li>Contact our support team to request a download of your data footprint.</li>
               </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Mail className="w-6 h-6 text-primary" /> F. Contact
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground text-center sm:text-left flex flex-col sm:flex-row items-center justify-between">
              <div>
                <p className="font-semibold text-foreground mb-1">Data Protection Officer</p>
                <p className="text-gray-500 text-sm mb-4 sm:mb-0">Reach out for any privacy-related queries.</p>
              </div>
              <a href="mailto:support@zerofoodwaste.in" className="inline-flex items-center justify-center px-6 py-3 font-semibold text-white bg-[#2f6f57] rounded-full hover:bg-[#235844] transition-colors focus:ring-4 focus:ring-green-500/20 active:scale-95 shadow-md">
                support@zerofoodwaste.in
              </a>
            </div>
          </section>

        </div>

        {/* Trust Badges */}
        <div className="mt-20 pt-10 border-t border-border flex flex-wrap justify-center gap-8 md:gap-16 opacity-80">
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-muted-foreground">
             <ShieldCheck className="w-5 h-5 text-[#10b981]" /> Secure Data
           </div>
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-muted-foreground">
             <HeartHandshake className="w-5 h-5 text-[#10b981]" /> Community Driven
           </div>
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-muted-foreground">
             <span className="text-xl">🇮🇳</span> Built for India
           </div>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-12 font-medium">
          Last updated: 2026
        </p>

      </div>
    </div>
  );
}
