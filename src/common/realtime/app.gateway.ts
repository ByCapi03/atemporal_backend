import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/auth/user.entity';

@WebSocketGateway({ cors: { origin: '*' } })
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly userRepository: Repository<User>
  ) {}

  afterInit(server: Server) {
    console.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinBranch')
  async handleJoinBranch(@ConnectedSocket() client: Socket, @MessageBody() data: { token: string }) {
    try {
      if (!data || !data.token) return;
      const payload = await this.jwtService.verifyAsync(data.token);
      
      if (payload && payload.sub) {
        const user = await this.userRepository.findOne({ where: { id: payload.sub } });
        if (user && user.active && user.branchId) {
          client.join(`branch:${user.branchId}`);
          console.log(`Client ${client.id} joined branch:${user.branchId}`);
        }
      }
    } catch (e) {
      console.error(`Invalid token for WS joinBranch from ${client.id}`);
    }
  }

  notifyReservationAttended(data: any) {
    this.server.to(`branch:${data.branchId}`).emit('reservation.attended', data);
  }
}
