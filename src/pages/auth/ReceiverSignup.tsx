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
        <p className="text-sm text-warning">
          <strong className="text-warning">Notice:</strong> All receiver accounts require admin verification before you can start accepting donations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Organization Name</label>
          <Input 
            name="orgName" 
            required 
            value={formData.orgName} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Contact Person</label>
          <Input 
            name="contactPerson" 
            required 
            value={formData.contactPerson} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Email</label>
          <Input 
            name="email" 
            type="email" 
            required 
            value={formData.email} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Password</label>
          <Input 
            name="password" 
            type="password" 
            required 
            value={formData.password} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Phone Number</label>
          <Input 
            name="phone" 
            type="tel" 
            required 
            value={formData.phone} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Organization Type</label>
          <select 
            name="orgType" 
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.orgType} 
            onChange={handleChange}
          >
            <option value="ngo" className="bg-card">NGO / Non-Profit</option>
            <option value="shelter" className="bg-card">Homeless Shelter</option>
            <option value="kitchen" className="bg-card">Community Kitchen</option>
            <option value="other" className="bg-card">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Service Area (City/Region)</label>
          <Input 
            name="serviceArea" 
            required 
            value={formData.serviceArea} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/20 text-xs text-info flex items-start gap-2">
          <span>🏛️</span>
          <span>
            Organization verification documents can be uploaded securely in the Verification center after registration.
          </span>
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
        <Link to="/register" className="text-sm font-medium text-info hover:text-blue-300 transition-colors">
          ← Back to roles
        </Link>
      </div>
    </AuthLayout>
  );
}
