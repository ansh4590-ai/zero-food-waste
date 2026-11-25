import { Button } from "../ui/button";
import { Brain, ShieldCheck, Map as MapIcon } from "lucide-react";

interface AdminHeaderProps {
  activeTab: 'verification' | 'fleet';
  onTabChange: (tab: 'verification' | 'fleet') => void;
}

export default function AdminHeader({ activeTab, onTabChange }: AdminHeaderProps) {
  return (
    <div className="mb-6 shrink-0 flex justify-between items-end">
      <div>
        <h2 className="text-2xl font-bold leading-7 text-foreground sm:text-3xl sm:truncate flex items-center gap-2">
          <Brain className="h-7 w-7 text-violet" />
          Central Command
        </h2>
        <p className="mt-1 text-sm text-gray-500">AI-powered identity verification &amp; multi-agent fleet operations.</p>
      </div>
      <div className="flex bg-muted p-1 rounded-lg">
        <Button variant={activeTab === 'verification' ? 'default' : 'ghost'} size="sm" onClick={() => onTabChange('verification')} className="gap-2">
          <ShieldCheck className="w-4 h-4"/> Smart KYC
        </Button>
        <Button variant={activeTab === 'fleet' ? 'default' : 'ghost'} size="sm" onClick={() => onTabChange('fleet')} className="gap-2">
          <MapIcon className="w-4 h-4"/> Operations Fleet
        </Button>
      </div>
    </div>
  );
}
