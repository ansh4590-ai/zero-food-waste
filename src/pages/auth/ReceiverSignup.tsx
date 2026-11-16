import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLoadingStore } from "../../store";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { AuthLayout } from "../../components/auth/AuthLayout";

export default function ReceiverSignup() {
  const navigate = useNavigate();
  const { isLoading, setLoading } = useLoadingStore();
  
  const [formData, setFormData] = useState({
    orgName: "",
    contactPerson: "",
    email: "",
    password: "",
    phone: "",
    orgType: "ngo",
    serviceArea: "",
  });
  const [verificationFile, setVerificationFile] = useState<File | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.orgName,
            role: 'receiver',
            phone: formData.phone,
            donor_type: formData.orgType,
            city: formData.serviceArea
          }
        }
      });

      if (error) {
        throw new Error((error as Error).message);
      }

      toast.success("Registered successfully. Pending verification.");
      navigate("/dashboard");
    } catch (err: unknown) {
      toast.error((err as Error).message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Receiver Registration"
      subtitle="Register your organization to receive food donations."
      illustrationText="Join a network of NGOs and shelters working together to eliminate hunger."
    >
      <div className="bg-amber-500/10 border-l-4 border-amber-500 p-4 mb-6 rounded-r-md">
        <p className="text-sm text-amber-500/90">
          <strong className="text-amber-400">Notice:</strong> All receiver accounts require admin verification before you can start accepting donations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Organization Name</label>
          <Input 
            name="orgName" 
            required 
            value={formData.orgName} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Contact Person</label>
          <Input 
            name="contactPerson" 
            required 
            value={formData.contactPerson} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Email</label>
          <Input 
            name="email" 
            type="email" 
            required 
            value={formData.email} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Password</label>
          <Input 
            name="password" 
            type="password" 
            required 
            value={formData.password} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Phone Number</label>
          <Input 
            name="phone" 
            type="tel" 
            required 
            value={formData.phone} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Organization Type</label>
          <select 
            name="orgType" 
            className="flex h-10 w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.orgType} 
            onChange={handleChange}
          >
            <option value="ngo" className="bg-zinc-900">NGO / Non-Profit</option>
            <option value="shelter" className="bg-zinc-900">Homeless Shelter</option>
            <option value="kitchen" className="bg-zinc-900">Community Kitchen</option>
            <option value="other" className="bg-zinc-900">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Service Area (City/Region)</label>
          <Input 
            name="serviceArea" 
            required 
            value={formData.serviceArea} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Verification Document (PDF/Image)</label>
          <Input 
            type="file" 
            accept=".pdf,image/*" 
            required 
            className="bg-zinc-900/50 border-white/10 text-zinc-400 file:text-white file:bg-zinc-800 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-md hover:file:bg-zinc-700" 
            onChange={(e) => setVerificationFile(e.target.files?.[0] || null)} 
          />
          <p className="text-xs text-zinc-500 mt-1">Registration certificate or any official NGO document.</p>
        </div>
        
        <Button 
          type="submit" 
          className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading}
        >
          {isLoading ? "Registering..." : "Submit for Verification"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/register" className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
          ← Back to roles
        </Link>
      </div>
    </AuthLayout>
  );
}
