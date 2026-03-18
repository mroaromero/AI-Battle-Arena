import React from 'react';
import { AppShell, Burger, Group, NavLink, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useLogout, useMenu } from '@refinedev/core';
import { IconSettings, IconLogout } from '@tabler/icons-react';

export const ThemedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [opened, { toggle }] = useDisclosure();
  const { mutate: logout } = useLogout();
  const { menuItems } = useMenu();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="xl"
      styles={{
        main: { background: 'transparent' },
        header: { 
          background: 'rgba(4,4,5,0.85)', 
          backdropFilter: 'blur(12px)', 
          borderBottom: '1px solid var(--border-bright)' 
        },
        navbar: { 
          background: 'rgba(10,10,13,0.95)', 
          borderRight: '1px solid var(--border-bright)' 
        }
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
            <div className="font-display text-white font-bold tracking-widest text-xl cursor-default glitch-text select-none pl-2">
              BATTLE_<span className="text-alpha">ADMIN</span>
            </div>
          </Group>
          <div className="font-mono text-[0.6rem] text-textMuted tracking-widest border border-borderBright px-3 py-1 bg-surface2 uppercase hidden sm:block">
            SISTEMA EN LÍNEA // CONECTADO
          </div>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="flex flex-col justify-between">
        <div style={{ flex: 1 }} className="space-y-2 mt-4">
          {menuItems.map((item) => (
            <NavLink
              key={item.key}
              label={item.label}
              leftSection={<IconSettings size="1.2rem" stroke={1.5} />}
              className={`font-mono font-bold tracking-widest uppercase text-xs p-3 transition-colors ${
                true ? 'bg-alpha-dim border-l-2 border-alpha text-text' : 'text-textMuted hover:bg-surface2 border-l-2 border-transparent hover:border-borderBright'
              }`}
              active={true}
            />
          ))}
        </div>
        <div className="border-t border-borderBright pt-4 mt-auto">
          <UnstyledButton 
            onClick={() => logout()} 
            className="w-full font-mono font-bold text-xs uppercase text-textMuted hover:text-white flex items-center gap-3 p-3 bg-surface2/50 border border-transparent hover:border-borderBright transition-all"
          >
            <IconLogout size="1.2rem" /> [ DESCONECTAR ]
          </UnstyledButton>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <div className="max-w-6xl mx-auto stagger-enter">
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
};
