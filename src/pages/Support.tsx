import { ShieldCheck, User, LifeBuoy, MapPin, Truck, AlertOctagon, HeartHandshake, Send, Mail } from "lucide-react";
import { Button } from "../components/ui/button";

export default function Support() {
  return (
    <div className="bg-gray-50 dark:bg-[#0f1111] pt-12 pb-12 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-6">
        
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2f6f57]/10 mb-6 border border-[#2f6f57]/20">
            <LifeBuoy className="w-8 h-8 text-[#2f6f57]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            Support Center
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Need help? We’re here to assist with donations, deliveries, app bugs, and critical account security issues.
          </p>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          <div className="lg:col-span-2 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Account Help */}
                <div className="bg-white dark:bg-[#171a1a] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-default group">
                   <div className="flex items-center gap-3 mb-4 text-[#2f6f57]">
                     <User className="w-5 h-5" />
                     <h2 className="text-lg font-bold text-gray-900 dark:text-white">A. Account Help</h2>
                   </div>
                   <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Login & auth issues</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Updating business profile</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Verification KYC help</li>
                   </ul>
                </div>

                {/* Donation Help */}
                <div className="bg-white dark:bg-[#171a1a] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-default group">
                   <div className="flex items-center gap-3 mb-4 text-[#2f6f57]">
                     <HeartHandshake className="w-5 h-5" />
                     <h2 className="text-lg font-bold text-gray-900 dark:text-white">B. Donation Help</h2>
                   </div>
                   <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> How to list surplus food</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Uploading image errors</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Pickup time coordination</li>
                   </ul>
                </div>

                {/* Volunteer Help */}
                <div className="bg-white dark:bg-[#171a1a] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-default group">
                   <div className="flex items-center gap-3 mb-4 text-[#2f6f57]">
                     <Truck className="w-5 h-5" />
                     <h2 className="text-lg font-bold text-gray-900 dark:text-white">C. Volunteer Help</h2>
                   </div>
                   <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Task claiming / bugs</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> QR camera scanning help</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Map dropoff routing problems</li>
                   </ul>
                </div>

                {/* Receiver Help */}
                <div className="bg-white dark:bg-[#171a1a] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-default group">
                   <div className="flex items-center gap-3 mb-4 text-[#2f6f57]">
                     <MapPin className="w-5 h-5" />
                     <h2 className="text-lg font-bold text-gray-900 dark:text-white">D. Receiver Help</h2>
                   </div>
                   <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Request mismatch / food issues</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Investigating delivery delays</li>
                     <li className="flex items-center gap-2 group-hover:text-gray-900 dark:group-hover:text-gray-300 transition-colors cursor-pointer"><div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /> Eligibility tier support</li>
                   </ul>
                </div>

                {/* Safety & Abuse */}
                <div className="md:col-span-2 bg-red-50 dark:bg-red-950/10 rounded-2xl p-6 border border-red-200 dark:border-red-900/30 shadow-sm hover:shadow-md transition-shadow cursor-default group">
                   <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-500">
                     <AlertOctagon className="w-5 h-5" />
                     <h2 className="text-lg font-bold text-red-900 dark:text-red-300">E. Safety & Abuse Reporting</h2>
                   </div>
                   <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-red-800 dark:text-red-400 font-medium">
                     <li className="flex items-center gap-2 cursor-pointer hover:underline cursor-pointer"><span>→</span> Report suspicious behavior</li>
                     <li className="flex items-center gap-2 cursor-pointer hover:underline cursor-pointer"><span>→</span> Report fake user profiles</li>
                     <li className="flex items-center gap-2 cursor-pointer hover:underline cursor-pointer"><span>→</span> Critical food safety concern</li>
                   </ul>
                </div>

             </div>
          </div>

          {/* Contact Direct & Form */}
          <div className="flex flex-col gap-6">

             {/* F. Contact Options Card */}
             <div className="bg-white dark:bg-[#171a1a] rounded-2xl p-6 md:p-8 border border-gray-200 dark:border-gray-800 shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="flex items-center gap-3 mb-6">
                  <Mail className="w-5 h-5 text-[#2f6f57]" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">F. Direct Contact</h2>
                </div>
                <div className="mb-8">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Founder / CEO</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">Ansh Maheshwari</p>
                  <a href="mailto:anshmaheshwari2005@gmail.com" className="text-sm font-medium text-[#2f6f57] hover:underline mt-1 block w-fitBreak font-mono">anshmaheshwari2005@gmail.com</a>
                </div>

                <div className="border-t border-gray-100 dark:border-white/5 pt-6">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-4">Quick Form</p>
                  <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                    <input type="text" placeholder="Your Name" className="w-full text-sm bg-gray-50 dark:bg-[#0A0C0C] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2f6f57]/50" />
                    <input type="email" placeholder="Email Address" className="w-full text-sm bg-gray-50 dark:bg-[#0A0C0C] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2f6f57]/50" />
                    <select className="w-full text-sm font-medium bg-gray-50 dark:bg-[#0A0C0C] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2f6f57]/50 text-gray-600 dark:text-gray-300">
                      <option disabled selected>Select Issue Type</option>
                      <option>Account Access</option>
                      <option>Delivery Tracking</option>
                      <option>Safety Incident</option>
                      <option>General Feedback</option>
                    </select>
                    <textarea rows={3} placeholder="Describe the issue neatly..." className="w-full resize-none text-sm bg-gray-50 dark:bg-[#0A0C0C] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2f6f57]/50" />
                    
                    <Button type="submit" className="w-full h-12 bg-[#2f6f57] text-white hover:bg-[#235844] mt-2 active:scale-95 font-bold rounded-xl shadow-md flex items-center justify-center gap-2">
                      <Send className="w-4 h-4" /> Send Request
                    </Button>
                  </form>
                </div>
             </div>

          </div>

        </div>

        {/* Trust Badges */}
        <div className="mt-20 pt-10 border-t border-gray-200 dark:border-gray-800 flex flex-wrap justify-center gap-8 md:gap-16 opacity-80">
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400">
             <ShieldCheck className="w-5 h-5 text-[#10b981]" /> Secure Data
           </div>
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400">
             <HeartHandshake className="w-5 h-5 text-[#10b981]" /> Community Driven
           </div>
           <div className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-gray-500 dark:text-gray-400">
             <span className="text-xl">🇮🇳</span> Built for India
           </div>
        </div>

      </div>
    </div>
  );
}
