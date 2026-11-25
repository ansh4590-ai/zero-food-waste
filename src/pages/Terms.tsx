import { ShieldCheck, Scale, FileText, Ban, AlertTriangle, Fingerprint, Mail, HeartHandshake } from "lucide-react";

export default function Terms() {
  return (
    <div className="bg-background pt-12 pb-12 text-foreground transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-6">
        
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2f6f57]/10 mb-6 border border-[#2f6f57]/20">
            <Scale className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Clear rules for safe and fair use of Zero Food Waste. Our guidelines protect the integrity of every food donation.
          </p>
        </div>

        {/* Content */}
        <div className="space-y-12">
          
          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <HeartHandshake className="w-6 h-6 text-primary" /> A. Platform Purpose
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground">
              <p>
                Zero Food Waste exists to eliminate hunger and radically reduce food surplus waste in India. The platform directly connects surplus food sources with people and organizations in need through a scalable technology layer.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <FileText className="w-6 h-6 text-primary" /> B. User Responsibilities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               
               <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                 <h3 className="font-bold text-lg text-foreground mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Donors</h3>
                 <ul className="space-y-3 text-sm text-muted-foreground">
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Provide accurate food details and timestamps.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Share absolutely safe, legitimately consumable food.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Respect requested pickup timings diligently.</li>
                 </ul>
               </div>

               <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                 <h3 className="font-bold text-lg text-foreground mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Receivers</h3>
                 <ul className="space-y-3 text-sm text-muted-foreground">
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Use the platform genuinely to feed those in need.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Request only the quantities actually needed.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Confirm deliveries via QR truthfully and promptly.</li>
                 </ul>
               </div>

               <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                 <h3 className="font-bold text-lg text-foreground mb-4 border-b border-gray-100 dark:border-gray-800 pb-2">Volunteers</h3>
                 <ul className="space-y-3 text-sm text-muted-foreground">
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Maintain courteous, respectful conduct always.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Follow strict pickup and handoff QR verification steps.</li>
                   <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#10b981] shrink-0" /> Protect donated food hygiene tightly while in transit.</li>
                 </ul>
               </div>

            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Ban className="w-6 h-6 text-primary" /> C. Prohibited Actions
            </h2>
            <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl p-6 md:p-8 border border-red-100 dark:border-red-900/30 text-red-900 dark:text-red-200 shadow-sm">
               <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 font-medium">
                 <li className="flex items-center gap-2">✗ Committing logistical or identity fraud.</li>
                 <li className="flex items-center gap-2">✗ Creating fake or bait-and-switch listings.</li>
                 <li className="flex items-center gap-2">✗ Any form of harassment toward parties.</li>
                 <li className="flex items-center gap-2">✗ General misuse/scraping of the platform API.</li>
                 <li className="flex items-center gap-2">✗ Uploading blatantly unsafe or spoiled food.</li>
                 <li className="flex items-center gap-2">✗ Impersonating authorized NGO representatives.</li>
               </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <Fingerprint className="w-6 h-6 text-primary" /> D. Verification
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground">
               <p>
                 To protect the network's integrity, Zero Food Waste employs mandatory Aadhaar verification for active volunteers, and manual Admin verifications for NGO properties. Unverified accounts retain zero dispatch capabilities.
               </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-primary" /> E. Liability
            </h2>
            <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm leading-relaxed text-muted-foreground">
               <p>
                 Zero Food Waste operates exclusively as a technology bridge facilitating the logistical coordination of donations. We cannot legally guarantee or assure the microbiological safety of food after the physical hand-over occurs. Responsibility regarding consumption fitness legally resides with the receiving party.
               </p>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <section>
               <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-4">
                 <Ban className="w-5 h-5 text-primary" /> F. Suspension
               </h2>
               <div className="bg-card rounded-2xl p-6 border border-border shadow-sm h-full flex flex-col justify-center">
                  <p className="text-muted-foreground text-sm">We unconditionally reserve the right to immediately suspend any account exhibiting flagged abusive, unresponsive, or fraudulent behavior across the network.</p>
               </div>
             </section>

             <section>
               <h2 className="text-2xl font-bold text-foreground flex items-center gap-3 mb-4">
                 <Mail className="w-5 h-5 text-primary" /> G. Contact
               </h2>
               <div className="bg-card rounded-2xl p-6 border border-border shadow-sm h-full flex flex-col justify-center">
                  <p className="text-muted-foreground text-sm mb-3">Notice a TOS violation? Email compliance immediately:</p>
                  <a href="mailto:support@zerofoodwaste.in" className="text-primary font-bold hover:underline">support@zerofoodwaste.in</a>
               </div>
             </section>
          </div>

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
