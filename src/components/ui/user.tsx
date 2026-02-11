interface UserProps {
  user?: {
    id: number;
    name: string;
  };
}

export default function User({ user }: UserProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-neutral-500 p-3 rounded-md">Imagem</div>
      <div>
        <h1 className="text-lg font-serif">{user?.name}</h1>
        <p className="text-sm text-neutral-300">Barbeiro Profissional</p>
      </div>
    </div>
  );
}
