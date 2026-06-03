import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MediaService } from '../services/media.service';
import { AddMediaDto, ReorderMediaDto, UpdateMediaDto } from '../dto/add-media.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@ApiTags('Media')
@Controller('clinics/:clinicId/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @ApiOperation({ summary: 'List media for a clinic' })
  list(@Param('clinicId', ParseIntPipe) clinicId: number) {
    return this.media.findForClinic(clinicId);
  }

  @Post()
  @ApiOperation({ summary: 'Add media to clinic (admin)' })
  add(@Param('clinicId', ParseIntPipe) clinicId: number, @Body() dto: AddMediaDto) {
    return this.media.add(clinicId, dto);
  }

  @Patch(':mediaId')
  @ApiOperation({ summary: 'Update media item (admin)' })
  update(
    @Param('clinicId', ParseIntPipe) clinicId: number,
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.media.update(clinicId, mediaId, dto);
  }

  @Delete(':mediaId')
  @ApiOperation({ summary: 'Remove media item (admin)' })
  remove(
    @Param('clinicId', ParseIntPipe) clinicId: number,
    @Param('mediaId', ParseIntPipe) mediaId: number,
  ) {
    return this.media.remove(clinicId, mediaId);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Reorder media by providing ordered array of ids (admin)' })
  reorder(@Param('clinicId', ParseIntPipe) clinicId: number, @Body() body: ReorderMediaDto) {
    return this.media.reorder(clinicId, body.orderedIds);
  }
}
