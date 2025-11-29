import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
    const path = import.meta.env.VITE_SOCKET_PATH || '/socket.io';
    const instance = io(url, { path, transports: ['websocket'] });
    setSocket(instance);
    return () => {
      instance.disconnect();
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

const useSocket = () => useContext(SocketContext);

export { SocketProvider, useSocket };
