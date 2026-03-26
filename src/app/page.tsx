import Header from "@/components/Header";
import ColliderChamber from "@/components/ColliderChamber";
import MatchupList from "@/components/MatchupList";
import EventLog from "@/components/EventLog";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex flex-col items-center gap-8 px-4 py-8">
        <ColliderChamber />
        <MatchupList matchups={[]} />
        <EventLog events={[]} />
      </main>
    </div>
  );
}
