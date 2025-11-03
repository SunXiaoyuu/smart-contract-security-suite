import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { RouterModule } from '@angular/router';
@Component({
  selector: 'app-workflow',
  standalone: true,  // ✅ 如果你的项目是standalone结构，这行必须保留
  imports: [CommonModule, MatCardModule,  MatFormFieldModule,MatInputModule,FormsModule,MatButtonModule,MatListModule,RouterModule ],
  templateUrl: './workflow.component.html',
  styleUrl: './workflow.component.css'
})
export class WorkflowComponent {

}
